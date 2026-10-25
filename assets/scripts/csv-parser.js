      function parseCSV(text) {
        text = text.replace(/^\uFEFF/, "");
        // Detect separators outside quotes in the first logical record.
        // A comma inside a quoted name must not turn a semicolon file into CSV.
        let inQuotes = false, commas = 0, semicolons = 0;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') i++;
            else inQuotes = !inQuotes;
          } else if (!inQuotes) {
            if (ch === "\n" || ch === "\r") {
              if (text.slice(0, i).trim()) break;
            } else if (ch === ",") commas++;
            else if (ch === ";") semicolons++;
          }
        }
        const delimiter = semicolons > commas ? ";" : ",";
        const rows = [];
        let row = [],
          field = "",
          quoted = false,
          closed = false;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (quoted) {
            if (ch === '"') {
              if (text[i + 1] === '"') {
                field += '"';
                i++;
              } else {
                quoted = false;
                closed = true;
              }
            } else field += ch;
            continue;
          }
          if (ch === '"') {
            if (field.trim() !== "" || closed)
              throw Error("نقل‌قول نامعتبر در CSV");
            quoted = true;
            field = "";
            continue;
          }
          if (ch === delimiter) {
            row.push(field);
            field = "";
            closed = false;
            continue;
          }
          if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[i + 1] === "\n") i++;
            row.push(field);
            if (row.some((x) => x.trim())) rows.push(row);
            row = [];
            field = "";
            closed = false;
            continue;
          }
          if (closed && !/\s/.test(ch))
            throw Error("نویسه اضافی پس از نقل‌قول CSV");
          if (!closed) field += ch;
        }
        if (quoted) throw Error("نقل‌قول CSV بسته نشده است.");
        row.push(field);
        if (row.some((x) => x.trim())) rows.push(row);
        return rows;
      }
