import { useColorScheme } from 'react-native';

export const light = {
  bg: '#f6f7f9', card: '#ffffff', text: '#14171c', sub: '#6a7079', line: '#e3e6ea',
  primary: '#0f9d76', onPrimary: '#ffffff', danger: '#d64545', pos: '#0f9d76', neg: '#d64545', chip: '#e9edf1',
};
export const dark: typeof light = {
  bg: '#0e1013', card: '#181b20', text: '#f2f4f6', sub: '#9aa1ab', line: '#272b32',
  primary: '#27c79b', onPrimary: '#04251b', danger: '#ff7070', pos: '#27c79b', neg: '#ff7070', chip: '#232830',
};
export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
