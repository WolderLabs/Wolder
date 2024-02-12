namespace Wolder.Core.Files;

public class SourceFiles(WorkspaceRootPath rootPath) 
    : WorkspaceFileSystem(rootPath, Path.Combine("src", DateTime.Now.ToString("yyyyMMdd-HHmmss"))), ISourceFiles;
