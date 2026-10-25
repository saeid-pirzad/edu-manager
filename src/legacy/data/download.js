      function downloadLocalFile(blob, name) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.hidden = true;
        document.body.append(link);
        const cleanup = () => {
          link.remove();
          URL.revokeObjectURL(url);
        };
        try {
          link.click();
        } catch (error) {
          cleanup();
          throw error;
        }
        setTimeout(cleanup, 60000);
      }
