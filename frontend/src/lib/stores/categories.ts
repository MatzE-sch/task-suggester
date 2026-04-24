import { writable } from 'svelte/store';
import type { Category } from '../types';
import { getCategories } from '../api';
import { getCachedCategories } from '../cache';

export const categories = writable<Category[]>([]);

export async function loadCategories() {
  const cached = getCachedCategories();
  if (cached) categories.set(cached);
  const cats = await getCategories();
  categories.set(cats);
}
