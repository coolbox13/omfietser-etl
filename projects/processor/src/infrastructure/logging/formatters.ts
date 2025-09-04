// src/infrastructure/logging/formatters.ts
import { format } from 'winston';

/**
 * Creates a formatted timestamp string
 */
export const timestampFormatter = format((info) => {
  info.timestamp = new Date().toISOString();
  return info;
});

/**
 * Formats error objects to be more serialization-friendly
 */
export const errorFormatter = format((info) => {
  if (info.error instanceof Error) {
    info.error = {
      name: info.error.name,
      message: info.error.message,
      stack: info.error.stack
    };
  }
  return info;
});

/**
 * Formats log context to add contextual information in a standardized way
 */
export const contextFormatter = format((info) => {
  if (info.context && typeof info.context === 'object') {
    // Add context properties to the top level but keep original for structure
    const contextProps = { ...info.context };
    if ('sensitive' in contextProps) {
        delete contextProps.sensitive; // Remove any sensitive data
    }
    
    // Add context to info without overriding existing properties
    Object.entries(contextProps).forEach(([key, value]) => {
        if (!info[key]) {
          info[key] = value;
        }
    });
  }
  return info;
});

/**
 * Creates a simple console formatter with colors
 */
export const consoleFormatter = format.combine(
  format.colorize(),
  format.printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length ? 
      `\n${JSON.stringify(meta, null, 2)}` : '';
      
    return `[${timestamp}] ${level}: ${message}${metaString}`;
  })
);

/**
 * Creates a JSON formatter for file output
 */
export const jsonFormatter = format.combine(
  format.json()
);