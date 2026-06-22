/**
 * Flag de onboarding visto, por household, em localStorage (por dispositivo).
 * Fail-safe: se o storage não está disponível, trata como visto pra não travar o app.
 */
const key = (householdId: string) => `onboardingDone:${householdId}`;

export function isOnboardingDone(householdId: string): boolean {
  try {
    return localStorage.getItem(key(householdId)) === '1';
  } catch {
    return true;
  }
}

export function markOnboardingDone(householdId: string): void {
  try {
    localStorage.setItem(key(householdId), '1');
  } catch {
    // storage indisponível — ignora
  }
}
