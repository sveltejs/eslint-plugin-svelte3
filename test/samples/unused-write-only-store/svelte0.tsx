let $writeOnly;let $readOnly;let $imported;

import { imported, createStore } from './store.js';

const writeOnly = createStore();
$writeOnly = 99;

const readOnly = createStore();
$readOnly;

$imported = 'some value';

{imported,writeOnly,readOnly,$writeOnly,$readOnly,$imported;$imported=0}