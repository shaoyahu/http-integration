import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUserStateDocFilter,
  shouldExposeSharedRequestState,
} from './userStateStorage.js';

test('getUserStateDocFilter stores user-scoped state by document id', () => {
  assert.deepEqual(getUserStateDocFilter('user-1'), { _id: 'user-1' });
});

test('shouldExposeSharedRequestState hides orphaned request state docs', () => {
  const usernameMap = new Map([
    ['user-1', 'alice'],
  ]);

  assert.equal(shouldExposeSharedRequestState('user-1', 'self', usernameMap), true);
  assert.equal(shouldExposeSharedRequestState('missing-user', 'self', usernameMap), false);
  assert.equal(shouldExposeSharedRequestState('self', 'self', usernameMap), false);
});
