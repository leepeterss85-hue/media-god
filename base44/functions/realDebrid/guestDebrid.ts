const clean = (value) =>
  String(value ?? "").trim();

const validDeviceKey = (value) => {
  const key =
    clean(value);

  return (
    key.length >= 32 &&
    key.length <= 256 &&
    /^[A-Za-z0-9._~-]+$/.test(
      key
    )
  );
};

const hashText =
  async (value) => {
    const bytes =
      new TextEncoder().encode(
        value
      );

    const digest =
      await crypto.subtle.digest(
        "SHA-256",
        bytes
      );

    return Array.from(
      new Uint8Array(
        digest
      ),
      (byte) =>
        byte
          .toString(16)
          .padStart(2, "0")
    ).join("");
  };

export const guestDeviceHash =
  async (value) => {
    if (
      !validDeviceKey(
        value
      )
    ) {
      return "";
    }

    return await hashText(
      clean(value)
    );
  };

export const loadGuestDebridCredential =
  async (
    base44,
    deviceKey
  ) => {
    const deviceHash =
      await guestDeviceHash(
        deviceKey
      );

    if (!deviceHash) {
      return {
        deviceHash:
          "",
        record:
          null,
      };
    }

    const rows =
      await base44
        .asServiceRole
        .entities
        .GuestDebridCredential
        .filter({
          device_key_hash:
            deviceHash,
        });

    return {
      deviceHash,
      record:
        Array.isArray(rows)
          ? rows[0] ||
            null
          : null,
    };
  };

export const saveGuestDebridCredential =
  async (
    base44,
    deviceHash,
    record,
    patch
  ) => {
    if (!deviceHash) {
      throw new Error(
        "Guest device key is invalid."
      );
    }

    const payload = {
      ...patch,
      device_key_hash:
        deviceHash,
      updated_at:
        new Date().toISOString(),
    };

    if (record?.id) {
      return await base44
        .asServiceRole
        .entities
        .GuestDebridCredential
        .update(
          record.id,
          payload
        );
    }

    return await base44
      .asServiceRole
      .entities
      .GuestDebridCredential
      .create(payload);
  };