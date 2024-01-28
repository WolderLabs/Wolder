namespace DeGA.Core.Files;

public class SourceFiles(PipelineRootPath rootPath) 
    : WorkspaceFileSystem(rootPath, "src"), ISourceFiles;