          // Bind to this form instance only after the modal accepts replacement.
          function bindCourseFormEvents(form) {
            form.addEventListener("submit", event => {
              event.preventDefault();
              void save().catch(error);
            });
            form.querySelector("#course_branch").addEventListener("change", toggleBranch);
            form.querySelector("#course_method").addEventListener("change", toggleMethod);
            form.querySelector("[data-course-cancel]").addEventListener("click", () => closeModal());
          }
