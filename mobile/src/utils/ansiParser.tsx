import React from 'react';
import { Text } from 'react-native';
import ansiStyles from 'ansi-styles';

// ANSI color codes to React Native color mapping
const ANSI_COLORS: { [key: string]: string } = {
  // Standard colors
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  // Bright colors
  blackBright: '#666666',
  redBright: '#f14c4c',
  greenBright: '#23d18b',
  yellowBright: '#f5f543',
  blueBright: '#3b8eea',
  magentaBright: '#d670d6',
  cyanBright: '#29b8db',
  whiteBright: '#e5e5e5',
};

// Type for React Native Text style
type TextStyle = {
  color?: string;
  backgroundColor?: string;
  fontWeight?: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
  fontStyle?: 'normal' | 'italic';
  textDecorationLine?: 'none' | 'underline' | 'line-through' | 'underline line-through';
  opacity?: number;
};

// Parse ANSI codes and return React Native Text components
export function parseAnsiToText(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let currentText = '';
  let currentStyle: TextStyle = {};
  
  // Regex to match ANSI escape codes
  const ansiRegex = /\x1b\[([0-9;]*)([a-zA-Z])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ansiRegex.exec(text)) !== null) {
    // Add text before the ANSI code
    if (match.index > lastIndex) {
      const textBefore = text.substring(lastIndex, match.index);
      if (textBefore) {
        if (currentText) {
          parts.push(
            <Text key={parts.length} style={currentStyle}>
              {currentText}
            </Text>
          );
          currentText = '';
        }
        currentText += textBefore;
      }
    }
    
    const code = match[1];
    const command = match[2];
    
    // Handle SGR (Select Graphic Rendition) codes - these are colors
    if (command === 'm') {
      // Apply the current text with current style
      if (currentText) {
        parts.push(
          <Text key={parts.length} style={currentStyle}>
            {currentText}
          </Text>
        );
        currentText = '';
      }
      
      // Parse the color code - handle empty codes
      const codes = code ? code.split(';').filter(s => s !== '').map(Number) : [0];
      
      // Create a new style object (don't reset completely, inherit some properties)
      let newStyle: TextStyle = { ...currentStyle };
      
      for (let i = 0; i < codes.length; i++) {
        const c = codes[i];
        
        // Reset - clear all styles
        if (c === 0) {
          newStyle = {};
          continue;
        }
        // Bold
        else if (c === 1) {
          newStyle.fontWeight = 'bold';
        }
        // Dim (faint)
        else if (c === 2) {
          newStyle.opacity = 0.5;
        }
        // Italic
        else if (c === 3) {
          newStyle.fontStyle = 'italic';
        }
        // Underline
        else if (c === 4) {
          newStyle.textDecorationLine = 'underline';
        }
        // Reset codes - check these BEFORE color codes to ensure proper reset
        // Reset bold/dim (22)
        else if (c === 22) {
          if ('fontWeight' in newStyle) delete newStyle.fontWeight;
          if ('opacity' in newStyle) delete newStyle.opacity;
        }
        // Reset italic (23)
        else if (c === 23) {
          if ('fontStyle' in newStyle) delete newStyle.fontStyle;
        }
        // Reset underline (24)
        else if (c === 24) {
          if ('textDecorationLine' in newStyle) delete newStyle.textDecorationLine;
        }
        // Reset foreground color (39) - default foreground  
        else if (c === 39) {
          if ('color' in newStyle) delete newStyle.color;
        }
        // Reset background color (49) - default background
        else if (c === 49) {
          if ('backgroundColor' in newStyle) delete newStyle.backgroundColor;
        }
        // Foreground colors (30-37)
        else if (c >= 30 && c <= 37) {
          const colorNames = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
          newStyle.color = ANSI_COLORS[colorNames[c - 30]];
        }
        // Bright foreground colors (90-97)
        else if (c >= 90 && c <= 97) {
          const colorNames = ['blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright'];
          newStyle.color = ANSI_COLORS[colorNames[c - 90]];
        }
        // Background colors (40-47)
        else if (c >= 40 && c <= 47) {
          const colorNames = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
          newStyle.backgroundColor = ANSI_COLORS[colorNames[c - 40]];
        }
        // Bright background colors (100-107)
        else if (c >= 100 && c <= 107) {
          const colorNames = ['blackBright', 'redBright', 'greenBright', 'yellowBright', 'blueBright', 'magentaBright', 'cyanBright', 'whiteBright'];
          newStyle.backgroundColor = ANSI_COLORS[colorNames[c - 100]];
        }
        // Truecolor RGB mode (38;2;R;G;B for foreground, 48;2;R;G;B for background)
        // Check this BEFORE 256-color mode since both start with 38
        else if (c === 38 && codes[i + 1] === 2 && codes[i + 2] !== undefined && codes[i + 3] !== undefined && codes[i + 4] !== undefined) {
          const r = codes[i + 2];
          const g = codes[i + 3];
          const b = codes[i + 4];
          const hexColor = `#${[r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
          newStyle.color = hexColor;
          i += 4;
        } else if (c === 48 && codes[i + 1] === 2 && codes[i + 2] !== undefined && codes[i + 3] !== undefined && codes[i + 4] !== undefined) {
          const r = codes[i + 2];
          const g = codes[i + 3];
          const b = codes[i + 4];
          // Convert RGB to hex with reduced opacity for background colors
          // Use rgba to make backgrounds more subtle (50% opacity)
          const hexColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
          newStyle.backgroundColor = hexColor;
          i += 4;
        }
        // 256-color mode (38;5;n for foreground, 48;5;n for background)
        else if (c === 38 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
          const color256 = codes[i + 2];
          newStyle.color = get256Color(color256);
          i += 2;
        } else if (c === 48 && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
          const color256 = codes[i + 2];
          newStyle.backgroundColor = get256Color(color256);
          i += 2;
        }
      }
      
      // Update currentStyle with the new style
      currentStyle = newStyle;
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    currentText += text.substring(lastIndex);
  }
  
  if (currentText) {
    parts.push(
      <Text key={parts.length} style={currentStyle}>
        {currentText}
      </Text>
    );
  }
  
  // Return a single Text component wrapping all parts, or the parts array if React Native supports it
  return parts.length > 0 ? <>{parts}</> : <Text>{text}</Text>;
}

// Convert 256-color mode to hex
function get256Color(index: number): string {
  if (index < 16) {
    // Standard 16 colors
    const colors = [
      '#000000', '#800000', '#008000', '#808000',
      '#000080', '#800080', '#008080', '#c0c0c0',
      '#808080', '#ff0000', '#00ff00', '#ffff00',
      '#0000ff', '#ff00ff', '#00ffff', '#ffffff',
    ];
    return colors[index] || '#ffffff';
  } else if (index < 232) {
    // 6x6x6 color cube
    const r = Math.floor((index - 16) / 36);
    const g = Math.floor(((index - 16) % 36) / 6);
    const b = (index - 16) % 6;
    const rVal = r === 0 ? 0 : 55 + r * 40;
    const gVal = g === 0 ? 0 : 55 + g * 40;
    const bVal = b === 0 ? 0 : 55 + b * 40;
    return `#${[rVal, gVal, bVal].map(x => x.toString(16).padStart(2, '0')).join('')}`;
  } else {
    // Grayscale
    const gray = 8 + (index - 232) * 10;
    const hex = gray.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }
}
