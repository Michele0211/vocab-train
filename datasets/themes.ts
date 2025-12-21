import capitalSeaAsia from '@/datasets/capital_sea_asia.json';
import countriesWestAsia from '@/datasets/countries_west_asia.json';
import seaAsiaCountries from '@/datasets/sea_asia_countries.json';

export type ThemeDataset = {
  id: string;
  title: string;
  answers: string[];
};

export type ThemeMeta = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  datasetPath: string;
  dataset: ThemeDataset;
};

export const THEMES: ThemeMeta[] = [
  {
    id: seaAsiaCountries.id,
    title: seaAsiaCountries.title,
    categoryId: 'geography',
    categoryTitle: '地理',
    datasetPath: 'datasets/sea_asia_countries.json',
    dataset: seaAsiaCountries as ThemeDataset,
  },
  {
    id: capitalSeaAsia.id,
    title: capitalSeaAsia.title,
    categoryId: 'geography',
    categoryTitle: '地理',
    datasetPath: 'datasets/capital_sea_asia.json',
    dataset: capitalSeaAsia as ThemeDataset,
  },
  {
    id: countriesWestAsia.id,
    title: countriesWestAsia.title,
    categoryId: 'geography',
    categoryTitle: '地理',
    datasetPath: 'datasets/countries_west_asia.json',
    dataset: countriesWestAsia as ThemeDataset,
  },
];

export type CategoryMeta = { id: string; title: string };

export const CATEGORIES: CategoryMeta[] = (() => {
  const map = new Map<string, CategoryMeta>();
  for (const t of THEMES) {
    if (!map.has(t.categoryId)) {
      map.set(t.categoryId, { id: t.categoryId, title: t.categoryTitle });
    }
  }
  return Array.from(map.values());
})();


