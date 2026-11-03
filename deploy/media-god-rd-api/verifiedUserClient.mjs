// Authentication is performed once by server.mjs. The existing Real-Debrid
// handlers receive ONLY this verified user-scoped client, never service role.
export const createClientFromRequest = (request) => {
  const client = request.__mediaGodVerifiedClient;
  if (!client || request.__mediaGodVerifiedUserId !== request.__mediaGodVerifiedUser?.id) {
    throw new Error("Verified Media God account required.");
  }
  return client;
};
