export const getPublicIp = async (): Promise<string | null> => {
  try {
    const res = await fetch("https://api.ipify.org?format=text");
    if (!res.ok) throw new Error("Failed to fetch public IP");
    const ip = await res.text();
    return ip;
  } catch {
    return null;
  }
};

// Converts an arbitrary string to a FQDN
export const toDomainNamePart = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replaceAll(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
