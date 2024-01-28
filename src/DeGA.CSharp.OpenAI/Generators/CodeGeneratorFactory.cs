using DeGA.CSharp.Compilation;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.CSharp.OpenAI.Generators;

public class CodeGeneratorFactory(IServiceProvider services)
{
    public CodeGenerator Create(DotNetProject project)
    {
        return ActivatorUtilities.CreateInstance<CodeGenerator>(services, project);
    }
}
