import { decode } from 'sourcemap-codec';

class GeneratedFragmentMapper {
	constructor(
		generatedCode,
		tagInfo,
	) {
		this.generatedCode = generatedCode;
		this.tagInfo = tagInfo;
	}

	getPositionRelativeToFragment(positionRelativeToFile) {
        const fragmentOffset = this.offsetInFragment(offsetAt(positionRelativeToFile, this.generatedCode));
        return positionAt(fragmentOffset, this.tagInfo.generatedContent);
	}

	offsetInFragment(offset) {
		return offset - this.tagInfo.generatedStart
	}
}

class OriginalFragmentMapper {
	constructor(
		originalCode,
		tagInfo,
	) {
		this.originalCode = originalCode;
		this.tagInfo = tagInfo;
	}

	getPositionRelativeToFile(positionRelativeToFragment) {
		const parentOffset = this.offsetInParent(offsetAt(positionRelativeToFragment, this.tagInfo.originalContent));
		return positionAt(parentOffset, this.originalCode);
	}

	offsetInParent(offset) {
		return this.tagInfo.originalStart + offset;
	}
}

class SourceMapper {
	constructor(rawSourceMap) {
		this.rawSourceMap = rawSourceMap;
	}

	getOriginalPosition(generatedPosition) {
		if (generatedPosition.line < 0) {
			return { line: -1, column: -1 };
		}

		// Lazy-load
		if (!this.decoded) {
			this.decoded = decode(JSON.parse(this.rawSourceMap).mappings);
		}

		let line = generatedPosition.line;
		let column = generatedPosition.column;

		let lineMatch = this.decoded[generatedPosition.line];
		while (line >= 0 && (!lineMatch || !lineMatch.length)) {
			line -= 1;
			lineMatch = this.decoded[generatedPosition];
			if (lineMatch && lineMatch.length) {
				return {
					line: lineMatch[lineMatch.length - 1][2],
					column: lineMatch[lineMatch.length - 1][3]
				};
			}
		}

		if (line < 0) {
			return { line: -1, column: -1 };
		}

		const columnMatch = lineMatch.find((col, idx) => 
			idx + 1 === lineMatch.length ||
			(col[0] <= column && lineMatch[idx + 1][0] > column)
		);

		return {
			line: columnMatch[2],
			column: columnMatch[3],
		};
	}
}

export class DocumentMapper {
	constructor(originalCode, generatedCode, diffs) {
		this.originalCode = originalCode;
		this.generatedCode = generatedCode;
		this.diffs = diffs;
		this.mappers = diffs.map(diff => {
			return {
				start: diff.generatedStart,
				end: diff.generatedEnd,
				diff: diff.diff,
				generatedFragmentMapper: new GeneratedFragmentMapper(generatedCode, diff),
				sourceMapper: new SourceMapper(diff.map),
				originalFragmentMapper: new OriginalFragmentMapper(originalCode, diff)
			}
		});
	}

    getOriginalPosition(generatedPosition) {
		generatedPosition = { line: generatedPosition.line - 1, column: generatedPosition.column };
        const offset = offsetAt(generatedPosition, this.generatedCode);
        let originalOffset = offset;
        for (const mapper of this.mappers) {
			if (offset >= mapper.start && offset <= mapper.end) {
				return this.map(mapper, generatedPosition);
			}
            if (offset > mapper.end) {
                originalOffset -= mapper.diff;
            }
        }
        const originalPosition = positionAt(originalOffset, this.originalCode);
		return this.toESLintPosition(originalPosition);
    }

	map(mapper, generatedPosition) {
        // Map the position to be relative to the transpiled fragment
        const positionInTranspiledFragment = mapper.generatedFragmentMapper.getPositionRelativeToFragment(
            generatedPosition
        );
        // Map the position, using the sourcemap, to the original position in the source fragment
        const positionInOriginalFragment = mapper.sourceMapper.getOriginalPosition(
            positionInTranspiledFragment
        );
        // Map the position to be in the original fragment's parent
        const originalPosition =  mapper.originalFragmentMapper.getPositionRelativeToFile(positionInOriginalFragment);
		return this.toESLintPosition(originalPosition);
	}

	toESLintPosition(position) {
		// ESLint line/column is 1-based
		return { line: position.line + 1, column: position.column + 1 };
	}

}

/**
 * Get the offset of the line and character position
 * @param position Line and character position
 * @param text The text for which the offset should be retrived
 */
function offsetAt(position, text) {
    const lineOffsets = getLineOffsets(text);

    if (position.line >= lineOffsets.length) {
        return text.length;
    } else if (position.line < 0) {
        return 0;
    }

    const lineOffset = lineOffsets[position.line];
    const nextLineOffset =
        position.line + 1 < lineOffsets.length ? lineOffsets[position.line + 1] : text.length;

    return clamp(nextLineOffset, lineOffset, lineOffset + position.column);
}

function positionAt(offset, text) {
    offset = clamp(offset, 0, text.length);

    const lineOffsets = getLineOffsets(text);
    let low = 0;
    let high = lineOffsets.length;
    if (high === 0) {
        return Position.create(0, offset);
    }

    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (lineOffsets[mid] > offset) {
            high = mid;
        } else {
            low = mid + 1;
        }
    }

    // low is the least x for which the line offset is larger than the current offset
    // or array.length if no line offset is larger than the current offset
    const line = low - 1;
    return { line, column: offset - lineOffsets[line] };
}

function getLineOffsets(text) {
    const lineOffsets = [];
    let isLineStart = true;

    for (let i = 0; i < text.length; i++) {
        if (isLineStart) {
            lineOffsets.push(i);
            isLineStart = false;
        }
        const ch = text.charAt(i);
        isLineStart = ch === '\r' || ch === '\n';
        if (ch === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
            i++;
        }
    }

    if (isLineStart && text.length > 0) {
        lineOffsets.push(text.length);
    }

    return lineOffsets;
}

function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num));
}
