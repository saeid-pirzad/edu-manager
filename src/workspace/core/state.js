        "use strict";
        const fileMode =
          typeof location !== "undefined" &&
          location.protocol === "file:" &&
          !globalThis.__EDU_SINGLE_FILE__;
        const old = {
          defaultDB,
          validateDB,
          render,
          calcStudentLesson,
          clickMasterCell,
          showModal,
          checkPassword,
          buildLessonGradesHtml,
          renderLessonStudents,
          buildLessonReportHtml,
        };
        let connection,
          workspace,
          ready = false,
          blocked = false,
          busy = 0,
          writer = Promise.resolve(),
          committed = new Map(),
          draftTimer,
          flushing = null,
          draftRecoveryFailed = false,
          pendingImport = null,
          pendingCSV = null,
          failNextWrite = false;
        let writeFailureGeneration = 0;
        let draftWriter = Promise.resolve(),
          draftWritesPending = 0;
        let draftGeneration = 0;
        let tabId,
          tabClaimed = false,
          collision = false;
        const documentToken = uid();
        try {
          tabId = sessionStorage.getItem("Edu24.tabId") || uid();
        } catch (ignore) {
          tabId = uid();
        }
        const drafts = new Map();
        let status = { message: "در حال آماده‌سازی…", type: "pending" };
        const channel =
          typeof BroadcastChannel === "function"
            ? new BroadcastChannel("EduManager24")
            : null;
