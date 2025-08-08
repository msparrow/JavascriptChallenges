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
  validation: string;
  hint: string;
}

function App() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [currentLessonIndex, setCurrentLessonIndex] = useState(0);
  const [code, setCode] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    fetch('/lessons.json')
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
      const fullScript = `
        try {
          ${code};
          const result = (function() { ${lessons[currentLessonIndex].validation} })();
          window.parent.postMessage({ type: 'result', payload: result ? 'Success! Correct!' : 'Keep trying! The validation failed.' }, '*');
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
      setShowHint(false);
    }
  };

  const goToPreviousLesson = () => {
    if (currentLessonIndex > 0) {
      const prevIndex = currentLessonIndex - 1;
      setCurrentLessonIndex(prevIndex);
      setResult('');
      setShowHint(false);
    }
  };

  const handleLessonSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newIndex = parseInt(e.target.value, 10);
    setCurrentLessonIndex(newIndex);
    setResult('');
    setShowHint(false);
  };

  const handleResetCode = () => {
    if (lessons.length > 0) {
      const currentLesson = lessons[currentLessonIndex];
      localStorage.removeItem(`code-lesson-${currentLesson.id}`);
      setCode(currentLesson.initialCode);
      setResult('Code has been reset.');
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'result') {
        setResult(event.data.payload);
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

  return (
    <div className="App">
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
        <iframe id="preview" src="/iframe.html" title="Preview"></iframe>
      </div>
    </div>
  );
}

export default App;