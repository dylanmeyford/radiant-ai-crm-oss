declare module 'officeparser' {
  export function parseOfficeAsync(input: Buffer | string): Promise<string>;
}


