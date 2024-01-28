using DeGA.Core.Assistant;

namespace DeGA.Core
{
    public class GeneratorWorkspace(
        IWorkspaceFileSystem fileSystem, 
        IWorkspaceCommandLine commandLine,
        IAIAssistantCacheStore assistantCache)
    {
        public IWorkspaceFileSystem FileSystem => fileSystem;
        public IWorkspaceCommandLine CommandLine => commandLine;
        public IAIAssistantCacheStore AssistantCache => assistantCache;

        public Task InitializeAsync()
        {
            return Task.CompletedTask;
        }
    }
}
