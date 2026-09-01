import { useTheme } from '@/contexts/ThemeContext'

// Switch animado de tema (sol/lua/nuvem). Estilo em src/styles/index.css.
// "checked" representa o modo claro (dia) — desmarcado é o modo escuro (noite).
export function ThemeSwitch() {
  const { theme, toggleTheme } = useTheme()

  return (
    <label className="switch" aria-label="Alternar tema claro/escuro">
      <input type="checkbox" checked={theme === 'light'} onChange={toggleTheme} />
      <span className="slider">
        <span className="star star_1" />
        <span className="star star_2" />
        <span className="star star_3" />
        <svg className="cloud" viewBox="0 0 100 40" xmlns="http://www.w3.org/2000/svg">
          <path
            fill="#fff"
            d="M85 30a15 15 0 0 0-14.5-15 20 20 0 0 0-38.6 5.6A13 13 0 0 0 15 32.5 13 13 0 0 0 15.5 40h68a12 12 0 0 0 1.5-10z"
          />
        </svg>
      </span>
    </label>
  )
}
