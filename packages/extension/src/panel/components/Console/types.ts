export type SerializedValue =
  | { __type: 'null' }
  | { __type: 'undefined' }
  | { __type: 'string';   v: string }
  | { __type: 'number';   v: number }
  | { __type: 'boolean';  v: boolean }
  | { __type: 'function'; name: string }
  | { __type: 'object';   cls: string; props: Record<string, SerializedValue>; objectId?: string }
  | { __type: 'array';    cls: string; len: number; props: Record<string, SerializedValue>; objectId?: string }
  | { __type: 'ref';      cls: string; objectId?: string }
  | { __type: 'circular' }
  | { __type: 'error' };

export interface ConsoleEntry {
  id: string;
  input: string;
  status: 'pending' | 'done' | 'error';
  value?: SerializedValue;
  text?: string;
  image?: string;
  codeBlock?: string;
  errorText?: string;
  getProperties?: (objectId: string) => Promise<unknown>;
}

export interface ConsoleHandle {
  clear: () => void;
  addResult: (result: { input: string; value?: SerializedValue; text?: string; image?: string; getProperties?: (objectId: string) => Promise<unknown> }) => void;
  runScript: (code: string) => Promise<void>;
}

export interface ConsoleProps {
  outputLines?: import('@/types').OutputLine[];
  className?: string;
}
