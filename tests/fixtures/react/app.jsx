import { useState } from 'react';
import { createRoot } from 'react-dom/client';

// A React controlled form: the DOM value only sticks if React's state updates.
function App() {
  const [years, setYears] = useState('');
  const [why, setWhy] = useState('');
  return (
    <form>
      <label htmlFor="years">How many years of professional Python experience do you have?</label>
      <input id="years" value={years} onChange={(e) => setYears(e.target.value)} />
      <label htmlFor="why" id="why-label">
        Why do you want to join us?
      </label>
      <textarea id="why" rows={4} value={why} onChange={(e) => setWhy(e.target.value)} />
      <output id="state">{JSON.stringify({ years, why })}</output>
    </form>
  );
}
createRoot(document.getElementById('root')).render(<App />);
