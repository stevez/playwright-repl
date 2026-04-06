import type { Dispatch } from 'react';
import type { Action } from '@/reducer';
import type { OutputLine, PickResultData } from '@/types';

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
  time?: number;
  value?: SerializedValue;
  text?: string;
  image?: string;
  video?: string;
  videoDuration?: number;
  videoSize?: number;
  trace?: boolean;
  traceSize?: number;
  codeBlock?: string;
  errorText?: string;
  getProperties?: (objectId: string) => Promise<unknown>;
  pickResult?: PickResultData;
}

export interface ConsoleHandle {
  clear: () => void;
  addResult: (result: { input: string; value?: SerializedValue; text?: string; image?: string; getProperties?: (objectId: string) => Promise<unknown> }) => void;
  runScript: (code: string) => Promise<void>;
}

export interface ConsoleProps {
  outputLines?: OutputLine[];
  dispatch: Dispatch<Action>;
  className?: string;
}
