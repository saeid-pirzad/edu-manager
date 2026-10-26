// Read-only UI operations may wait for their own writes to finish, so revision
// changes are allowed. Switching workspace or selected class is not.
function preserveAsyncTarget({ classScoped = false } = {}) {
  assertWorkspaceReadable();
  const id = workspace.id,
    schoolId = state.schoolId,
    classId = state.classId;
  return () => {
    assertWorkspaceReadable();
    if (
      workspace.id !== id ||
      (classScoped &&
        (state.schoolId !== schoolId || state.classId !== classId))
    )
      throw Error(
        "دوره یا کلاس هنگام آماده‌سازی تغییر کرد؛ عملیات را دوباره باز کنید.",
      );
  };
}
