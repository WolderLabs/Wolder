using DeGA.Core.Files;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.CSharp.Compilation;

public class DotNetProjectFactory(IServiceProvider services, ISourceFiles sourceFiles)
{
    public DotNetProject Create(DotNetProjectReference reference)
    {
        var path = reference.RelativeFilePath;
        var fullPath = sourceFiles.GetAbsolutePath(path);
        return ActivatorUtilities.CreateInstance<DotNetProject>(services, fullPath);
    }
}
