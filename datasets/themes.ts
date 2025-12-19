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
  datasetPath: string;
  dataset: ThemeDataset;
};

export const THEMES: ThemeMeta[] = [
  {
    id: seaAsiaCountries.id,
    title: seaAsiaCountries.title,
    categoryId: 'geography',
    datasetPath: 'datasets/sea_asia_countries.json',
    dataset: seaAsiaCountries as ThemeDataset,
  },
  {
    id: capitalSeaAsia.id,
    title: capitalSeaAsia.title,
    categoryId: 'geography',
    datasetPath: 'datasets/capital_sea_asia.json',
    dataset: capitalSeaAsia as ThemeDataset,
  },
  {
    id: countriesWestAsia.id,
    title: countriesWestAsia.title,
    categoryId: 'geography',
    datasetPath: 'datasets/countries_west_asia.json',
    dataset: countriesWestAsia as ThemeDataset,
  },
];


