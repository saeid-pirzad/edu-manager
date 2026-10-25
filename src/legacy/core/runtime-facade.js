// Stable entry points used by existing markup and browser integrations.
function openSettingsModal(...args) {
  return EduRuntimeAPI.invoke("openSettingsModal", undefined, this, args);
}

function saveSettings(...args) {
  return EduRuntimeAPI.invoke("saveSettings", undefined, this, args);
}

function sessionStudent(...args) {
  return EduRuntimeAPI.invoke("sessionStudent", undefined, this, args);
}

function knownStudentCode(...args) {
  return EduRuntimeAPI.invoke("knownStudentCode", undefined, this, args);
}

function downloadRawRecovery(...args) {
  return EduRuntimeAPI.invoke("downloadRawRecovery", legacy_downloadRawRecovery, this, args);
}

function openLessonConfig(...args) {
  return EduRuntimeAPI.invoke("openLessonConfig", legacy_openLessonConfig, this, args);
}

function saveLessonConfig(...args) {
  return EduRuntimeAPI.invoke("saveLessonConfig", legacy_saveLessonConfig, this, args);
}

function addLesson(...args) {
  return EduRuntimeAPI.invoke("addLesson", legacy_addLesson, this, args);
}

function gradeStatus(...args) {
  return EduRuntimeAPI.invoke("gradeStatus", legacy_gradeStatus, this, args);
}

function buildLessonGradesHtml(...args) {
  return EduRuntimeAPI.invoke("buildLessonGradesHtml", legacy_buildLessonGradesHtml, this, args);
}

function renderLessonStudents(...args) {
  return EduRuntimeAPI.invoke("renderLessonStudents", legacy_renderLessonStudents, this, args);
}

function buildLessonReportHtml(...args) {
  return EduRuntimeAPI.invoke("buildLessonReportHtml", legacy_buildLessonReportHtml, this, args);
}

function defaultDB(...args) {
  return EduRuntimeAPI.invoke("defaultDB", legacy_defaultDB, this, args);
}

function prepareDB(...args) {
  return EduRuntimeAPI.invoke("prepareDB", legacy_prepareDB, this, args);
}

function validateDB(...args) {
  return EduRuntimeAPI.invoke("validateDB", legacy_validateDB, this, args);
}

function saveDB(...args) {
  return EduRuntimeAPI.invoke("saveDB", legacy_saveDB, this, args);
}

function render(...args) {
  return EduRuntimeAPI.invoke("render", legacy_render, this, args);
}

function calcStudentLesson(...args) {
  return EduRuntimeAPI.invoke("calcStudentLesson", legacy_calcStudentLesson, this, args);
}

function buildKardaneshGradesHtml(...args) {
  return EduRuntimeAPI.invoke("buildKardaneshGradesHtml", legacy_buildKardaneshGradesHtml, this, args);
}

function buildKardaneshSummaryHtml(...args) {
  return EduRuntimeAPI.invoke("buildKardaneshSummaryHtml", legacy_buildKardaneshSummaryHtml, this, args);
}

function openBulkScoreModal(...args) {
  return EduRuntimeAPI.invoke("openBulkScoreModal", legacy_openBulkScoreModal, this, args);
}

function setAllAttendance(...args) {
  return EduRuntimeAPI.invoke("setAllAttendance", legacy_setAllAttendance, this, args);
}

function saveSessionUnit(...args) {
  return EduRuntimeAPI.invoke("saveSessionUnit", legacy_saveSessionUnit, this, args);
}

function updateSessionUnits(...args) {
  return EduRuntimeAPI.invoke("updateSessionUnits", legacy_updateSessionUnits, this, args);
}

function addSessionScore(...args) {
  return EduRuntimeAPI.invoke("addSessionScore", legacy_addSessionScore, this, args);
}

function clickMasterCell(...args) {
  return EduRuntimeAPI.invoke("clickMasterCell", legacy_clickMasterCell, this, args);
}

function exportBackup(...args) {
  return EduRuntimeAPI.invoke("exportBackup", legacy_exportBackup, this, args);
}

function handleImport(...args) {
  return EduRuntimeAPI.invoke("handleImport", legacy_handleImport, this, args);
}

function handleExcelImport(...args) {
  return EduRuntimeAPI.invoke("handleExcelImport", legacy_handleExcelImport, this, args);
}

function downloadExcelTemplate(...args) {
  return EduRuntimeAPI.invoke("downloadExcelTemplate", legacy_downloadExcelTemplate, this, args);
}

function openTransferModal(...args) {
  return EduRuntimeAPI.invoke("openTransferModal", legacy_openTransferModal, this, args);
}

function deleteStudent(...args) {
  return EduRuntimeAPI.invoke("deleteStudent", legacy_deleteStudent, this, args);
}

function restoreStudent(...args) {
  return EduRuntimeAPI.invoke("restoreStudent", legacy_restoreStudent, this, args);
}

function doTransfer(...args) {
  return EduRuntimeAPI.invoke("doTransfer", legacy_doTransfer, this, args);
}

function deleteSchool(...args) {
  return EduRuntimeAPI.invoke("deleteSchool", legacy_deleteSchool, this, args);
}

function deleteClass(...args) {
  return EduRuntimeAPI.invoke("deleteClass", legacy_deleteClass, this, args);
}

function deleteLesson(...args) {
  return EduRuntimeAPI.invoke("deleteLesson", legacy_deleteLesson, this, args);
}

function addSchool(...args) {
  return EduRuntimeAPI.invoke("addSchool", undefined, this, args);
}

function addClass(...args) {
  return EduRuntimeAPI.invoke("addClass", undefined, this, args);
}

function addStudent(...args) {
  return EduRuntimeAPI.invoke("addStudent", legacy_addStudent, this, args);
}

function openEditStudentModal(...args) {
  return EduRuntimeAPI.invoke("openEditStudentModal", legacy_openEditStudentModal, this, args);
}

function buildArchiveHtml(...args) {
  return EduRuntimeAPI.invoke("buildArchiveHtml", legacy_buildArchiveHtml, this, args);
}

function buildOverviewKarnamehHtml(...args) {
  return EduRuntimeAPI.invoke("buildOverviewKarnamehHtml", legacy_buildOverviewKarnamehHtml, this, args);
}

function buildDetailedKarnamehHtml(...args) {
  return EduRuntimeAPI.invoke("buildDetailedKarnamehHtml", legacy_buildDetailedKarnamehHtml, this, args);
}

function generateParentReportText(...args) {
  return EduRuntimeAPI.invoke("generateParentReportText", legacy_generateParentReportText, this, args);
}

function wipeAllData(...args) {
  return EduRuntimeAPI.invoke("wipeAllData", legacy_wipeAllData, this, args);
}

function showModal(...args) {
  return EduRuntimeAPI.invoke("showModal", undefined, this, args);
}

function checkPassword(...args) {
  return EduRuntimeAPI.invoke("checkPassword", legacy_checkPassword, this, args);
}
