export default defineUnlistedScript(() => {
  const w = window as unknown as { __answersnap?: boolean };
  if (w.__answersnap) return;
  w.__answersnap = true;
});
