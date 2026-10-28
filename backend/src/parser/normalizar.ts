/** Quita caracteres invisibles que WhatsApp mete en las exportaciones. */
export function limpiarInvisibles(s: string): string {
  return s
    .replace(/^﻿/, '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/[   ]/g, ' ');
}

/**
 * Normaliza un nombre para compararlo: minúsculas, sin tildes, sin emojis
 * ni símbolos y con espacios simples. "Juan Moto 🚚" -> "juan moto".
 */
export function normalizarNombre(s: string): string {
  return limpiarInvisibles(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
