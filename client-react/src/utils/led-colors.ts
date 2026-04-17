/**
 * Map from LED color names to CSS color values.
 * Values sourced from the Angular SCSS variables in main.component.scss.
 */
export const LED_COLORS: Record<string, string> = {
    blue: 'rgb(41, 121, 255)',
    cyan: 'rgb(0, 229, 255)',
    green: 'rgb(0, 230, 118)',
    magenta: 'rgb(213, 0, 249)',
    orange: 'rgb(255, 145, 0)',
    red: 'rgb(255, 23, 68)',
    white: 'rgb(255, 255, 255)',
    yellow: 'rgb(255, 234, 0)',
};

/** The default LED color (green) used when no custom color is specified */
export const LED_COLOR_DEFAULT = LED_COLORS.green;

/** The "off" LED color */
export const LED_COLOR_OFF = 'rgb(80, 80, 80)';
