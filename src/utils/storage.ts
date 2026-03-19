/**
 * Safely retrieves an item from localStorage, wrapping the call in a try-catch block.
 * Returns a default value if localStorage is not available or if the key doesn't exist.
 * @param key The key of the item to retrieve.
 * @param defaultValue The value to return if retrieval fails or the key is not found.
 * @returns The stored value or the default value.
 */
export function safeLocalStorageGet<T>(key: string, defaultValue: T): T {
  try {
    const storedValue = localStorage.getItem(key);
    if (storedValue === null) {
      return defaultValue;
    }
    // Assumes stored value is a plain string for themes, but could be expanded to parse JSON.
    return storedValue as unknown as T;
  } catch (error) {
    console.warn(`Could not read from localStorage for key "${key}":`, error);
    return defaultValue;
  }
}

/**
 * Safely sets an item in localStorage, wrapping the call in a try-catch block.
 * Only writes the value if it's truthy.
 * @param key The key of the item to set.
 * @param value The value to set.
 */
export function safeLocalStorageSet<T>(key: string, value: T): void {
  if (!value) {
    return;
  }
  try {
    // Assumes value can be converted to a string.
    localStorage.setItem(key, String(value));
  } catch (error) {
    console.warn(`Could not write to localStorage for key "${key}":`, error);
  }
}
