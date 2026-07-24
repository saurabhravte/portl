export function createMockSupabase(
  rpc: jest.Mock = jest.fn(async () => ({ data: null, error: null })),
) {
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    maybeSingle: jest.fn(async () => ({ data: null, error: null })),
    single: jest.fn(async () => ({ data: null, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);

  return {
    rpc,
    from: jest.fn(() => query),
    channel: jest.fn(),
    removeChannel: jest.fn(),
    __query: query,
  };
}
