      function openEditStudentModal(stId) {
        const c = getClassObj(state.schoolId, state.classId);
        const student = getStudentObj(c, stId);
        if (!student) return;
        let h = `<div class="form-row"><label>نام و نام خانوادگی:</label>
    <input type="text" id="editStudentName" value="${esc(student.name)}" style="flex:1" required></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px">
      <button class="ghost" onclick="closeModal()">انصراف</button>
      <button onclick="saveEditStudent('${stId}')">💾 ذخیره</button>
    </div>`;
        showModal("✏️ ویرایش نام دانش‌آموز", h);
      }
      async function saveEditStudent(stId) {
        const c = getClassObj(state.schoolId, state.classId);
        const student = getStudentObj(c, stId);
        if (!student) return;
        const newName = document.getElementById("editStudentName").value.trim();
        if (!newName) return alert("نام نمی‌تواند خالی باشد");
        student.name = newName;
        await saveDB({ classId: c.id });
        closeModal();
      }

