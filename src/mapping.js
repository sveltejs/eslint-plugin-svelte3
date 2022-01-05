import { decode } from 'sourcemap-codec';

class GeneratedFragmentMapper {
	constructor(generated_code, diff) {
		this.generated_code = generated_code;
		this.diff = diff;
	}

	get_position_relative_to_fragment(position_relative_to_file) {
		const fragment_offset = this.offset_in_fragment(offset_at(position_relative_to_file, this.generated_code));
		return position_at(fragment_offset, this.diff.generated_content);
	}

	offset_in_fragment(offset) {
		return offset - this.diff.generated_start;
	}
}

class OriginalFragmentMapper {
	constructor(original_code, diff) {
		this.original_code = original_code;
		this.diff = diff;
	}

	get_position_relative_to_file(position_relative_to_fragment) {
		const parent_offset = this.offset_in_parent(offset_at(position_relative_to_fragment, this.diff.original_content));
		return position_at(parent_offset, this.original_code);
	}

	offset_in_parent(offset) {
		return this.diff.original_start + offset;
	}
}

class SourceMapper {
	constructor(raw_source_map) {
		this.raw_source_map = raw_source_map;
	}

	get_original_position(generated_position) {
		if (generated_position.line < 0) {
			return { line: -1, column: -1 };
		}

		// Lazy-load
		if (!this.decoded) {
			this.decoded = decode(JSON.parse(this.raw_source_map).mappings);
		}

		let line = generated_position.line;
		let column = generated_position.column;

		let line_match = this.decoded[line];
		while (line >= 0 && (!line_match || !line_match.length)) {
			line -= 1;
			line_match = this.decoded[line];
			if (line_match && line_match.length) {
				return {
					line: line_match[line_match.length - 1][2],
					column: line_match[line_match.length - 1][3]
				};
			}
		}

		if (line < 0) {
			return { line: -1, column: -1 };
		}

		const column_match = line_match.find((col, idx) =>
			idx + 1 === line_match.length ||
			(col[0] <= column && line_match[idx + 1][0] > column)
		);

		return {
			line: column_match[2],
			column: column_match[3],
		};
	}
}

export class DocumentMapper {
	constructor(original_code, generated_code, diffs) {
		this.original_code = original_code;
		this.generated_code = generated_code;
		this.diffs = diffs;
		this.mappers = diffs.map(diff => {
			return {
				start: diff.generated_start,
				end: diff.generated_end,
				diff: diff.diff,
				generated_fragment_mapper: new GeneratedFragmentMapper(generated_code, diff),
				source_mapper: new SourceMapper(diff.map),
				original_fragment_mapper: new OriginalFragmentMapper(original_code, diff)
			};
		});
	}

	get_original_position(generated_position) {
		generated_position = { line: generated_position.line - 1, column: generated_position.column };
		const offset = offset_at(generated_position, this.generated_code);
		let original_offset = offset;
		for (const mapper of this.mappers) {
			if (offset >= mapper.start && offset <= mapper.end) {
				return this.map(mapper, generated_position);
			}
			if (offset > mapper.end) {
				original_offset -= mapper.diff;
			}
		}
		const original_position = position_at(original_offset, this.original_code);
		return this.to_ESLint_position(original_position);
	}

	map(mapper, generated_position) {
		// Map the position to be relative to the transpiled fragment
		const position_in_transpiled_fragment = mapper.generated_fragment_mapper.get_position_relative_to_fragment(
			generated_position
		);
		// Map the position, using the sourcemap, to the original position in the source fragment
		const position_in_original_fragment = mapper.source_mapper.get_original_position(
			position_in_transpiled_fragment
		);
		// Map the position to be in the original fragment's parent
		const original_position = mapper.original_fragment_mapper.get_position_relative_to_file(position_in_original_fragment);
		return this.to_ESLint_position(original_position);
	}

	to_ESLint_position(position) {
		// ESLint line/column is 1-based
		return { line: position.line + 1, column: position.column + 1 };
	}

}

/**
 * Get the offset of the line and character position
 * @param position Line and character position
 * @param text The text for which the offset should be retrieved
 */
export function offset_at(position, text) {
	const line_offsets = get_line_offsets(text);

	if (position.line >= line_offsets.length) {
		return text.length;
	} else if (position.line < 0) {
		return 0;
	}

	const line_offset = line_offsets[position.line];
	const next_line_offset =
		position.line + 1 < line_offsets.length ? line_offsets[position.line + 1] : text.length;

	return clamp(next_line_offset, line_offset, line_offset + position.column);
}

/**
 * Get the line and character position of an offset
 * @param offset Idx of the offset
 * @param text The text for which the position should be retrieved
 */
export function position_at(offset, text) {
	offset = clamp(offset, 0, text.length);

	const line_offsets = get_line_offsets(text);
	let low = 0;
	let high = line_offsets.length;
	if (high === 0) {
		return { line: 0, column: offset };
	}

	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (line_offsets[mid] > offset) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}

	// low is the least x for which the line offset is larger than the current offset
	// or array.length if no line offset is larger than the current offset
	const line = low - 1;
	return { line, column: offset - line_offsets[line] };
}

function get_line_offsets(text) {
	const line_offsets = [];
	let is_line_start = true;

	for (let i = 0; i < text.length; i++) {
		if (is_line_start) {
			line_offsets.push(i);
			is_line_start = false;
		}
		const ch = text.charAt(i);
		is_line_start = ch === '\r' || ch === '\n';
		if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
			i++;
		}
	}

	if (is_line_start && text.length > 0) {
		line_offsets.push(text.length);
	}

	return line_offsets;
}

function clamp(num, min, max) {
	return Math.max(min, Math.min(max, num));
}
