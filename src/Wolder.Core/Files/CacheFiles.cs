namespace Wolder.Core.Files;

public class CacheFiles : WorkspaceFileSystem, ICacheFiles
{
    public CacheFiles(PipelineRootPath rootPath) 
        : base(rootPath, "cache")
    {
    }
}