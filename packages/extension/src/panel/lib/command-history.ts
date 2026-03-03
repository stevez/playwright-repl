const _history: string[] = [];
let _index = 0;

export function getCommandHistory() {
    return _history;
}

export function clearHistory() {
    _history.length = 0;
    _index = 0;
}

export function addCommand(command: string) {
    _history.push(command);
    _index = _history.length;
}

export function goUp() {
    if (_index > 0) {
        _index--;
        return _history[_index];
    }
}

export function goDown() {
    if (_index < _history.length - 1) {
        _index++;
        return _history[_index];
    }
    if (_index === _history.length - 1) {
        _index = _history.length;
        return '';
    }
}