export const ADMIN_CREDENTIALS = [
  { id: 'admin1', password: 'store@Admin1' },
  { id: 'admin2', password: 'store@Admin2' },
  { id: 'admin3', password: 'store@Admin3' },
  { id: 'admin4', password: 'store@Admin4' },
] as const;

export function verifyAdmin(id: string, password: string): boolean {
  return ADMIN_CREDENTIALS.some(
    (cred) => cred.id === id && cred.password === password
  );
}
