// Only this adapter reads workspace bindings; authorization state is private to
// the service instance and independent of the workspace bundle's shared scope.
const yearNoteScope = EduYearNoteScope({
  getState: () => ({
    workspace,
    connection,
    installation: installationToken,
    password: db.settings.password,
    authenticated: isAuthenticated,
    resetBusy,
    connectionRetired,
  }),
  storage: {
    request: (request) => requestPromise(request),
    done: (transaction) => transactionDone(transaction),
  },
  termKind: (term) => academicTermKind(term),
});
function permitYearNoteAccess(period, data) {
  return yearNoteScope.permit(period, data);
}
function academicYearNotesContext() {
  return yearNoteScope.context();
}
function synchronizeYearNotesScope() {
  return yearNoteScope.synchronize();
}
function invalidateYearNotesScope(message) {
  return yearNoteScope.invalidate(message);
}
