namespace DeGA.Core.Files;

public class SourceFiles : WorkspaceFileSystem
{
    public SourceFiles(PipelineRootPath rootPath) 
        : base(rootPath, "src")
    {
    }
}