declare module 'dompurify' {
  interface DOMPurifyLike {
    sanitize(input: string): string
  }

  const DOMPurify: DOMPurifyLike
  export default DOMPurify
}

declare module 'markdown-it' {
  interface MarkdownItOptions {
    html?: boolean
    linkify?: boolean
  }

  class MarkdownIt {
    constructor(options?: MarkdownItOptions)
    render(markdown: string): string
  }

  export default MarkdownIt
}
