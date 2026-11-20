// The landlord-style listing for one saved home: description, six key facts, and a "Full listing" fold with
// the rest and every room. Details are SYNTHETIC (web/public/data/listing_details.json) and labeled so.
import { money } from './rank.js';
import Icon from '../components/Icon.jsx';

const KEY = [['available', 'Move-in'], ['lease', 'Lease'], ['laundry', 'Laundry'], ['parking', 'Parking'], ['pets', 'Pets'], ['furnished', 'Furnished']];
const MORE = [['deposit', 'Deposit'], ['utilities', 'Utilities'], ['internet', 'Internet'], ['heatCool', 'Heat and cooling'],
  ['kitchen', 'Kitchen'], ['bathrooms', 'Bathrooms'], ['outdoor', 'Outdoor space'], ['street', 'Street'], ['smoking', 'Smoking'], ['built', 'Built']];
const BATH = { private: 'Private', half: 'Half', shared: 'Shared' };
const LIGHT = ['Low', 'Medium', 'Bright'];
const FLOOR = { basement: 'Basement', 1: '1st', 2: '2nd', 3: '3rd', attic: 'Attic' };

export default function ListingDetails({ home, d, roomId }) {
  if (!d) return null;
  const n = home.rooms.length;
  const util = (home.utilities || 0) / n;
  return (
    <details className="ld sv-more" onClick={(e) => e.stopPropagation()}>
      <summary>Details</summary>
      <p className="ld-desc">{d.description}</p>
      <dl className="ld-facts">
        {KEY.map(([k, l]) => <div key={k}><dt>{k === 'laundry' ? <Icon name="laundry" size={13} label={null} /> : null}{l}</dt><dd>{d[k]}</dd></div>)}
      </dl>
      <details className="sv-more ld-more">
        <summary>Full listing</summary>
        <dl className="ld-facts ld-all">
          {MORE.map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{String(d[k])}</dd></div>)}
        </dl>
        <table className="ld-rooms">
          <thead><tr><th>Room</th><th>Size</th><th>Bath</th><th>Daylight</th><th>Floor</th><th>Rent</th></tr></thead>
          <tbody>
            {home.rooms.map((r) => (
              <tr key={r.id} className={r.id === roomId ? 'best' : undefined}>
                <td>{r.label}{r.id === roomId ? <span className="ld-best">Best for you</span> : null}</td>
                <td>{r.sqft} sq ft</td><td>{BATH[r.bath] || r.bath}</td><td>{LIGHT[r.light ?? 1]}</td>
                <td>{FLOOR[r.floor] || r.floor}</td><td>{money(r.asking)}<span className="st-sub"> + {money(util)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="st-sub">Rent per room plus its share of utilities. Whole house {money(home.rent)}/mo.</p>
      </details>
      <p className="ld-label">Sample listing details, made up for the demo.</p>
    </details>
  );
}
