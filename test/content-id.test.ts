import { describe, expect, it } from 'vitest'
import { parseContentId } from '../shared/utils/content-id'

describe('parseContentId — youtube', () => {
  it('passes a raw id through', () => {
    expect(parseContentId('bBsmJXwDFto', 'youtube')).toBe('bBsmJXwDFto')
  })
  it('extracts from a watch URL', () => {
    expect(parseContentId('https://www.youtube.com/watch?v=bBsmJXwDFto&t=10', 'youtube')).toBe('bBsmJXwDFto')
  })
  it('extracts from youtu.be', () => {
    expect(parseContentId('https://youtu.be/bBsmJXwDFto', 'youtube')).toBe('bBsmJXwDFto')
  })
  it('extracts from a shorts URL', () => {
    expect(parseContentId('https://youtube.com/shorts/bBsmJXwDFto', 'youtube')).toBe('bBsmJXwDFto')
  })
  it('trims whitespace', () => {
    expect(parseContentId('  bBsmJXwDFto  ', 'youtube')).toBe('bBsmJXwDFto')
  })
})

describe('parseContentId — facebook', () => {
  it('passes a page_post id through', () => {
    expect(parseContentId('123_456', 'facebook')).toBe('123_456')
  })
  it('extracts from a /posts/ URL', () => {
    expect(parseContentId('https://www.facebook.com/100/posts/789', 'facebook')).toBe('789')
  })
  it('extracts from story_fbid', () => {
    expect(parseContentId('https://www.facebook.com/story.php?story_fbid=789&id=100', 'facebook')).toBe('789')
  })
})
