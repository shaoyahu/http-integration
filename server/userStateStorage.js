export const getUserStateDocId = (userId) => String(userId);

export const getUserStateDocFilter = (userId) => ({
  _id: getUserStateDocId(userId),
});

export const shouldExposeSharedRequestState = (ownerUserId, currentUserId, usernameMap) => {
  const normalizedOwnerId = getUserStateDocId(ownerUserId);
  return normalizedOwnerId !== getUserStateDocId(currentUserId) && usernameMap.has(normalizedOwnerId);
};
