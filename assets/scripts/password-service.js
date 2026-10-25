      async function hashPassword(password, salt) {
        if (!globalThis.crypto?.subtle)
          throw Error("مرورگر از ذخیره امن رمز پشتیبانی نمی‌کند.");
        salt = salt || crypto.getRandomValues(new Uint8Array(16));
        const key = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(password),
          "PBKDF2",
          false,
          ["deriveBits"],
        );
        const bits = await crypto.subtle.deriveBits(
          { name: "PBKDF2", salt, iterations: 210000, hash: "SHA-256" },
          key,
          256,
        );
        const hex = (bytes) =>
          Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
        return "pbkdf2$210000$" + hex(salt) + "$" + hex(new Uint8Array(bits));
      }

      async function verifyPassword(password, stored) {
        if (!stored.startsWith("pbkdf2$")) return password === stored;
        if (!/^pbkdf2\$210000\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(stored))
          return false;
        const hex = stored.split("$")[2],
          salt = Uint8Array.from(hex.match(/../g), (x) => parseInt(x, 16));
        const actual = await hashPassword(password, salt);
        let difference = 0;
        for (let i = 0; i < actual.length; i++)
          difference |= actual.charCodeAt(i) ^ stored.charCodeAt(i);
        return difference === 0;
      }
