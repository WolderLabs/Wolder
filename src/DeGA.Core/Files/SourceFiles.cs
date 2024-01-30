namespace DeGA.Core.Files;

public class SourceFiles(PipelineRootPath rootPath) 
    : WorkspaceFileSystem(rootPath, Path.Combine("src", DateTime.Now.ToString("yyyyMMdd-HHmmss"))), ISourceFiles;
