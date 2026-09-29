import { EventEmitter } from 'events';

import { FirestorePermissionError } from './errors';

type Events = {
  'permission-error': (error: FirestorePermissionError) => void;
};

// This is a global event emitter to allow us to bubble up errors to the
// UI without having to pass down a bunch of props.
export const errorEmitter = new EventEmitter();

