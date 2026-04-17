import { writable } from 'svelte/store';
import type { Category } from '../types';
import { getCategories } from '../api';

export const categories = writable<Category[]>([]);

export async function loadCategories() {
  const cats = await getCategories();
  categories.set(cats);
}
