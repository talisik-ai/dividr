import { PropertiesPanel } from '@/Components/Main/VideoPreview/PropertiesPanel';
import { StylePanel } from '@/Components/Main/VideoPreview/StylePanel';
import { Component, ErrorInfo, ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Timeline } from '../Components/Main/Timeline/Timeline';
import TitleBar from '../Components/Main/Titlebar';
import Toolbar from '../Components/Main/Toolbar';
// Error Boundary component
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Error Detection
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center">
          <h1 className="text-xl text-red-600">Something went wrong</h1>
          <p className="text-gray-600">{this.state.error?.message}</p>
          <button
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
// End of Error Detection

const VideoEditorLayout = () => {

  return (
    <ErrorBoundary>
      <div className="h-screen flex flex-col bg-black dark:bg-darkMode text-gray-900 dark:text-gray-100 pb-2 pr-2">
        <TitleBar className="h-13 py-4 px-2 bg-black dark:bg-darkMode" />
        <div className="flex flex-1 overflow-hidden h-[calc(100vh-120px)]">
          <Toolbar
            className={`w-[60px] bg-secondary mx-2 mb-4 overflow-y-auto h-full transition-all duration-300 rounded`}
          />
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className='flex flex-row flex-1 overflow-hidden'>
            <StylePanel/>
            <main className="flex-1 overflow-auto">
              <Outlet />
            </main>
            <PropertiesPanel/>
            </div>
            <div className="h-[180px] md:h-[175px] lg:h-[245px] flex-shrink-0">
               <Timeline />
            </div>
          </div>
        </div>
        </div>
    </ErrorBoundary>
  );
};

export default VideoEditorLayout;
