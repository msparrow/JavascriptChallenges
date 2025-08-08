import { useState, useEffect, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import './App.css';

interface Lesson {
  id: string;
  title: string;
  explanation: string;
  challenge: string;
  initialCode: string;
  validation?: string;
  tests?: TestCase[];
  hint: string;
}

interface TestCase {
  name: string;
  assertion: string; // JS that returns boolean
}

interface TestRunResult {
  passCount: number;
  totalCount: number;
  details: { name: string; passed: boolean; error?: string }[];
}

function App() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [code, setCode] = useState('');
  const [result, setResult] = useState('');
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showGlossary, setShowGlossary] = useState(false);
  const [glossary, setGlossary] = useState<{ term: string; definition: string; example?: string }[]>([]);
  const [expandedGlossary, setExpandedGlossary] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}lessons.json`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        setLessons(data);
      })
      .catch(error => {
        console.error('Error fetching lessons:', error);
        setError(`Failed to load lessons. Check the browser console for more details.`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  //Test comment
  // Load glossary once
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    fetch(`${base}glossary.json`)
      .then(res => (res.ok ? res.json() : []))
      .then((items) => setGlossary(items))
      .catch(() => setGlossary([]));
  }, []);

  const toggleGlossary = (idx: number) => {
    setExpandedGlossary(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Load initial code from localStorage or default
  useEffect(() => {
    if (lessons.length > 0) {
      const savedCode = localStorage.getItem(`code-lesson-${lessons[currentLessonIndex].id}`);
      setCode(savedCode || lessons[currentLessonIndex].initialCode);
    }
  }, [currentLessonIndex, lessons]);

  // Save code to localStorage on change
  useEffect(() => {
    if (lessons.length > 0) {
      localStorage.setItem(`code-lesson-${lessons[currentLessonIndex].id}`, code);
    }
  }, [code, currentLessonIndex, lessons]);

  const handleCodeChange = useCallback((value: string) => {
    setCode(value);
  }, []);

  const handleRunCode = () => {
    const iframe = document.getElementById('preview') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      const lesson = lessons[currentLessonIndex];
      // Build test runner if tests exist; otherwise fall back to single validation
      const hasTests = Array.isArray(lesson.tests) && lesson.tests.length > 0;
      const testsArrayLiteral = hasTests
        ? `[${lesson.tests!.map(t => `{name:${JSON.stringify(t.name)}, fn:function(){ ${t.assertion} }}`).join(',')}]`
        : '[]';

      const fullScript = `
        try {
          ${code};
          const hasTests = ${String(hasTests)};
          if (hasTests) {
            const tests = ${testsArrayLiteral};
            const details = [];
            let passCount = 0;
            for (const t of tests) {
              try {
                const passed = (function(){ return t.fn(); })();
                if (passed) passCount += 1;
                details.push({ name: t.name, passed });
              } catch (err) {
                details.push({ name: t.name, passed: false, error: String(err && err.message ? err.message : err) });
              }
            }
            window.parent.postMessage({ type: 'testResults', payload: { passCount, totalCount: tests.length, details } }, '*');
          } else {
            const result = (function() { ${lesson.validation ?? 'return false;'} })();
            window.parent.postMessage({ type: 'result', payload: result ? 'Success! Correct!' : 'Keep trying! The validation failed.' }, '*');
          }
        } catch (e) {
          window.parent.postMessage({ type: 'result', payload: 'Error: ' + e.message }, '*');
        }
      `;
      iframe.contentWindow.postMessage({ script: fullScript }, '*');
    }
  };

  const goToNextLesson = () => {
    if (currentLessonIndex < lessons.length - 1) {
      const nextIndex = currentLessonIndex + 1;
      setCurrentLessonIndex(nextIndex);
      setResult('');
      setTestResult(null);
      setShowHint(false);
    }
  };

  const goToPreviousLesson = () => {
    if (currentLessonIndex > 0) {
      const prevIndex = currentLessonIndex - 1;
      setCurrentLessonIndex(prevIndex);
      setResult('');
      setTestResult(null);
      setShowHint(false);
    }
  };

  const handleLessonSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    setCurrentLessonIndex(newIndex);
    setResult('');
    setTestResult(null);
    setShowHint(false);
  };

  const handleResetCode = () => {
    if (lessons.length > 0) {
      const currentLesson = lessons[currentLessonIndex];
      localStorage.removeItem(`code-lesson-${currentLesson.id}`);
      setCode(currentLesson.initialCode);
      setResult('Code has been reset.');
      setTestResult(null);
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event || !event.data) return;
      if (event.data.type === 'result') {
        setTestResult(null);
        setResult(event.data.payload);
      } else if (event.data.type === 'testResults' && event.data.payload) {
        setResult('');
        setTestResult(event.data.payload as TestRunResult);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  if (loading) {
    return <div className="status-pane">Loading...</div>;
  }

  if (error) {
    return <div className="status-pane error-pane">{error}</div>;
  }

  if (lessons.length === 0) {
    return <div className="status-pane">No lessons found.</div>;
  }

  const lesson = lessons[currentLessonIndex];

  const base = import.meta.env.BASE_URL || '/';
  return (
    <div className="App">
      <button className="glossary-fab" onClick={() => setShowGlossary(true)}>Glossary</button>
      <div className="lesson-pane">
        <h1>{lesson.title}</h1>
        <p>{lesson.explanation}</p>
        <p><strong>Challenge:</strong> {lesson.challenge}</p>
        <div className="navigation-controls">
          <div className="navigation-buttons">
            <button onClick={goToPreviousLesson} disabled={currentLessonIndex === 0}>
              Previous
            </button>
            <button onClick={goToNextLesson} disabled={currentLessonIndex === lessons.length - 1}>
              Next
            </button>
          </div>
          <select className="lesson-dropdown" onChange={handleLessonSelect} value={currentLessonIndex}>
            {lessons.map((lesson, index) => (
              <option key={lesson.id} value={index}>
                {index + 1}. {lesson.title}
              </option>
            ))}
          </select>
        </div>
        <div className="challenge-actions">
          <button className="hint-button" onClick={() => setShowHint(!showHint)}>
            {showHint ? 'Hide Hint' : 'Show Hint'}
          </button>
        </div>
        {showHint && (
          <div className="hint-box">
            <p><strong>Hint:</strong> {lesson.hint}</p>
          </div>
        )}
        {result && (
          <div className={`result ${result.includes('Success') ? 'success' : 'failure'}`}>
            {result}
          </div>
        )}
        {testResult && (
          <div className={`result ${testResult.passCount === testResult.totalCount ? 'success' : 'failure'}`}>
            <div><strong>{testResult.passCount} / {testResult.totalCount}</strong> tests passed</div>
            <ul className="test-details">
              {testResult.details.map((d, i) => (
                <li key={i} className={d.passed ? 'passed' : 'failed'}>
                  {d.passed ? '✔' : '✖'} {d.name}{d.error ? ` — ${d.error}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="editor-pane">
        <CodeMirror
          value={code}
          height="calc(100vh - 40px)"
          extensions={[javascript({ jsx: true })]}
          theme={vscodeDark}
          onChange={handleCodeChange}
        />
        <div className="editor-actions">
          <button className="run-button" onClick={handleRunCode}>Run Code</button>
          <button className="reset-button" onClick={handleResetCode}>Reset Code</button>
        </div>
      </div>
      <div className="preview-pane">
        <iframe id="preview" src={`${base}iframe.html`} title="Preview"></iframe>
      </div>

      {showGlossary && (
        <div className="modal-backdrop" onClick={() => setShowGlossary(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Glossary</h2>
              <button className="modal-close" onClick={() => setShowGlossary(false)}>×</button>
            </div>
            <div className="modal-body glossary-list">
              {glossary.length === 0 && <p>No glossary items found.</p>}
              {glossary.map((g, idx) => {
                const isOpen = !!expandedGlossary[idx];
                return (
                  <div key={idx} className={`glossary-item ${isOpen ? 'open' : ''}`}>
                    <button className="glossary-header" onClick={() => toggleGlossary(idx)}>
                      <span className="term">{g.term}</span>
                      <span className={`chevron ${isOpen ? 'rot' : ''}`}>▾</span>
                    </button>
                    {isOpen && (
                      <div className="glossary-content">
                        <p className="definition">{g.definition}</p>
                        {g.example && (
                          <div className="code-block">
                            <pre><code>{g.example}</code></pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;