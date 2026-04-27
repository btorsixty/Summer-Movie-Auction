export default function Rules() {
    var sectionStyle = {
      background: 'linear-gradient(135deg, #1a1410, #0d0a07)',
      border: '1px solid #2a1f15',
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 20,
    };
  
    var headerStyle = {
      padding: '14px 24px',
      borderBottom: '2px solid #c9a227',
      fontFamily: 'var(--font-display)',
      fontSize: 15,
      fontWeight: 900,
      color: '#c9a227',
      letterSpacing: 3,
      textTransform: 'uppercase',
    };
  
    var bodyStyle = {
      padding: '20px 24px',
      fontSize: 14,
      lineHeight: 1.7,
      color: '#c8b89a',
    };
  
    var subheadStyle = {
      fontFamily: 'var(--font-display)',
      fontSize: 14,
      fontWeight: 700,
      color: '#e8d5b7',
      letterSpacing: 1,
      marginTop: 20,
      marginBottom: 8,
    };
  
    var firstSubheadStyle = { ...subheadStyle, marginTop: 0 };
  
    var accentText = function(text) {
      return { color: '#c9a227', fontWeight: 700 };
    };
  
    return (
      <div style={{ paddingTop: 20, maxWidth: 760, margin: '0 auto' }}>
  
        {/* Page title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontSize: 'clamp(24px, 5vw, 36px)',
            fontWeight: 900, color: '#c9a227',
            textShadow: '0 0 20px rgba(201,162,39,0.3)',
          }}>
            Official Rules & Format
          </div>
          <div style={{
            fontSize: 11, color: '#6a5f55', marginTop: 6, letterSpacing: 3,
            fontFamily: 'var(--font-display)', textTransform: 'uppercase',
          }}>
            The Summer Movie Auction — 2026 Season
          </div>
        </div>
  
        {/* ─── THE CONCEPT ─────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={headerStyle}>The Concept</div>
          <div style={bodyStyle}>
            <p style={{ margin: '0 0 12px' }}>
              Every major movie releasing between May and September is up for grabs. Each player bids to "own" movies using a fixed budget, then earns points based on how those movies perform at the <span style={accentText()}>U.S. domestic box office</span>. At the end of the summer, the player whose portfolio earned the most wins.
            </p>
            <p style={{ margin: 0 }}>
              Think of it like fantasy football, but for Hollywood. You're the studio head. Build your slate. Beat the competition.
            </p>
          </div>
        </div>
  
        {/* ─── YOUR BUDGET ─────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={headerStyle}>Your Budget</div>
          <div style={bodyStyle}>
            <p style={{ margin: 0 }}>
              Every player starts with <span style={accentText()}>$100 in auction dollars</span>. This is your entire budget for the season. Once it's gone, it's gone. Spread it across many movies or go all-in on a few blockbusters. Spend wisely.
            </p>
          </div>
        </div>
  
        {/* ─── AUCTION NIGHT ───────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={headerStyle}>Auction Night</div>
          <div style={bodyStyle}>
            <p style={{ margin: '0 0 12px' }}>
              All movies are auctioned one at a time. The host presents each movie and bidding opens immediately.
            </p>
  
            <div style={firstSubheadStyle}>How Bidding Works</div>
            <p style={{ margin: '0 0 12px' }}>
              The clock starts at <span style={accentText()}>10 seconds</span>. Any player can bid by choosing a <span style={accentText()}>+$1</span>, <span style={accentText()}>+$5</span>, or <span style={accentText()}>+$10</span> increment above the current high bid. Each new bid resets the clock back to 10 seconds. When the clock hits zero with no new bids, the movie is sold to the highest bidder.
            </p>
  
            <div style={subheadStyle}>Winning a Movie</div>
            <p style={{ margin: '0 0 12px' }}>
              The host confirms each sale. The winning bid is deducted from your budget and the movie is added to your portfolio. If no one bids, the movie goes unsold.
            </p>
  
            <div style={subheadStyle}>Strategy</div>
            <p style={{ margin: 0 }}>
              You can't bid more than your remaining budget. If you blow $80 on one movie, you only have $20 left for everything else. The best players balance big bets with smart bargains.
            </p>
          </div>
        </div>
  
        {/* ─── SCORING ─────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={headerStyle}>Scoring</div>
          <div style={bodyStyle}>
            <p style={{ margin: '0 0 12px' }}>
              All scoring is based on <span style={accentText()}>U.S. Domestic Box Office gross</span> only, sourced from Box Office Mojo. Only movies that release in theaters between <span style={accentText()}>May 1 and September 30</span> are eligible.
            </p>
            <p style={{ margin: '0 0 12px' }}>
              If a movie gets delayed and doesn't release during this window, its box office value is $0. If a movie releases during the window but is still in theaters after September 30, it continues to accumulate earnings for scoring purposes.
            </p>
            <p style={{ margin: 0 }}>
              Standings are updated weekly. The season officially ends when all eligible movies have had at least 4 weeks of theatrical run time, or <span style={accentText()}>October 31</span>, whichever comes first.
            </p>
          </div>
        </div>
  
        {/* ─── PROGRESSIVE TAX ─────────────────────────────── */}
        <div style={{ ...sectionStyle, border: '1px solid #c9a227' }}>
          <div style={{ ...headerStyle, background: 'linear-gradient(135deg, #c9a22715, transparent)' }}>
            Progressive Tax System
          </div>
          <div style={bodyStyle}>
            <p style={{ margin: '0 0 16px' }}>
              To keep things competitive, a <span style={accentText()}>progressive tax</span> is applied to each movie's domestic gross individually before adding it to your total. This prevents one mega-blockbuster from running away with the competition and rewards players who build diversified portfolios.
            </p>
  
            {/* Tax bracket visual */}
            <div style={{
              background: '#0d0a07', border: '1px solid #2a1f15', borderRadius: 8,
              padding: 20, marginBottom: 16,
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: '#6a5f55', letterSpacing: 2, marginBottom: 12, textAlign: 'center' }}>
                TAX BRACKETS
              </div>
  
              {/* Bracket 1 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid #1a1410' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #2a9d8f, #3dccbb)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, color: '#0d0a07', flexShrink: 0,
                }}>
                  100%
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#e8d5b7', fontSize: 14 }}>First $200M</div>
                  <div style={{ fontSize: 12, color: '#6a5f55' }}>Counted at full value. Every dollar earned is a dollar scored.</div>
                </div>
              </div>
  
              {/* Bracket 2 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0', borderBottom: '1px solid #1a1410' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #c9a227, #f4d03f)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, color: '#0d0a07', flexShrink: 0,
                }}>
                  50%
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#e8d5b7', fontSize: 14 }}>$200M to $400M</div>
                  <div style={{ fontSize: 12, color: '#6a5f55' }}>Earnings in this range are taxed at 50%. A movie earning $300M scores $250M.</div>
                </div>
              </div>
  
              {/* Bracket 3 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #e63946, #ff6b6b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16, color: '#0d0a07', flexShrink: 0,
                }}>
                  25%
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: '#e8d5b7', fontSize: 14 }}>Above $400M</div>
                  <div style={{ fontSize: 12, color: '#6a5f55' }}>Heavily taxed. A $500M movie only scores $325M. Mega-hits are still valuable, but they won't run away with it.</div>
                </div>
              </div>
            </div>
  
            {/* Example */}
            <div style={{
              background: '#0d0a07', border: '1px solid #2a1f15', borderRadius: 8, padding: 16,
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: '#6a5f55', letterSpacing: 2, marginBottom: 10, textAlign: 'center' }}>
                EXAMPLE
              </div>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#c8b89a' }}>
                A movie earns <span style={accentText()}>$500M</span> domestic:
              </p>
              <div style={{ fontSize: 13, color: '#c8b89a', paddingLeft: 12 }}>
                <div style={{ marginBottom: 4 }}>First $200M at 100% = <span style={accentText()}>$200M</span></div>
                <div style={{ marginBottom: 4 }}>Next $200M at 50% = <span style={accentText()}>$100M</span></div>
                <div style={{ marginBottom: 4 }}>Final $100M at 25% = <span style={accentText()}>$25M</span></div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #2a1f15', fontWeight: 700, color: '#e8d5b7' }}>
                  Taxed total: <span style={accentText()}>$325M</span> (instead of $500M)
                </div>
              </div>
            </div>
  
            <p style={{ margin: '16px 0 0', fontSize: 13 }}>
              The tax is applied to each movie individually. A player with five $100M movies ($500M total, all untaxed) scores higher than a player with one $500M movie ($325M after tax). <span style={{ color: '#e8d5b7', fontWeight: 600 }}>Diversification is rewarded.</span>
            </p>
          </div>
        </div>
  
        {/* ─── KEEP YOUR STUBS ────────────────────────────── */}
        <div style={{ ...sectionStyle, border: '1px solid #2a9d8f' }}>
          <div style={{ ...headerStyle, borderBottomColor: '#2a9d8f', background: 'linear-gradient(135deg, #2a9d8f15, transparent)' }}>
            🎟️ Keep Your Stubs!
          </div>
          <div style={bodyStyle}>
            <p style={{ margin: '0 0 12px' }}>
              If you go see one of your own movies in theaters, <span style={accentText()}>keep your ticket stub</span>. At the end of the season, stubs will be collected for a secret bonus.
            </p>
            <p style={{ margin: 0, color: '#2a9d8f', fontWeight: 600, fontStyle: 'italic' }}>
              That's all we're saying for now. Don't throw them away.
            </p>
          </div>
        </div>
  
        {/* ─── THE WINNER ──────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={headerStyle}>The Winner</div>
          <div style={bodyStyle}>
            <p style={{ margin: 0 }}>
              The player with the highest <span style={accentText()}>total taxed domestic gross</span> at the end of the season wins. Bragging rights for a full year.
            </p>
          </div>
        </div>
  
        {/* ─── AWARDS ──────────────────────────────────────── */}
        <div style={sectionStyle}>
          <div style={headerStyle}>End-of-Season Awards</div>
          <div style={bodyStyle}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {[
                { icon: '💎', title: 'Best Value', desc: 'Highest domestic gross per auction dollar spent.' },
                { icon: '💀', title: 'Biggest Bust', desc: 'Worst return on a bid of $5 or more.' },
                { icon: '🌙', title: 'Sleeper of the Summer', desc: 'Highest-grossing movie bid at $5 or less.' },
                { icon: '👑', title: 'Top Grosser', desc: 'Single movie with the highest raw domestic gross.' },
              ].map(function(award, i) {
                return (
                  <div key={i} style={{
                    background: '#0d0a07', border: '1px solid #2a1f15', borderRadius: 8, padding: 14,
                  }}>
                    <div style={{ fontSize: 20, marginBottom: 6 }}>{award.icon}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: '#e8d5b7', fontSize: 13, marginBottom: 4 }}>{award.title}</div>
                    <div style={{ fontSize: 12, color: '#6a5f55', lineHeight: 1.5 }}>{award.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
  
        <div style={{ height: 40 }} />
      </div>
    );
  }
  