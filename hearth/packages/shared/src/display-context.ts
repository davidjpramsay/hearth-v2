// A negative capability hint, never proof of identity or a grant of authority.
export function isTelevisionUserAgent(userAgent: string): boolean {
  return /HearthTV\/|SMART-TV|Tizen|GoogleTV|Android TV|NetCast|Web0S|WebOS/i.test(userAgent);
}
