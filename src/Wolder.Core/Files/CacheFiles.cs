namespace Wolder.Core.Files;

public class CacheFiles : WorkspaceFileSystem, ICacheFiles
{
    public CacheFiles(WorkspaceRootPath rootPath) 
        : base(rootPath, "cache")
    {
    }
}